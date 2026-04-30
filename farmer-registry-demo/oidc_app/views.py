import logging
import os
import json
import base64
import hashlib
import urllib

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
from django.views.decorators.csrf import csrf_exempt
import jwt
import requests
from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponse
from datetime import datetime, timedelta
from jose import JWTError
from jwcrypto import jwk, jwe
from jwcrypto.jwe import InvalidJWEData, JWE
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.environ.get('CLIENT_ID')
REDIRECT_URI = os.environ.get('REDIRECT_URI')
AUTHORIZATION_ENDPOINT = os.environ.get('AUTHORIZATION_ENDPOINT')
TOKEN_ENDPOINT = os.environ.get('TOKEN_ENDPOINT')
USERINFO_ENDPOINT = os.environ.get('USERINFO_ENDPOINT')
PRIVATE_KEY = os.environ.get('PRIVATE_KEY')
EXPIRATION_TIME = timedelta(minutes=15)
ALGORITHM = os.environ.get('ALGORITHM') or 'RS256'
CLIENT_ASSERTION_TYPE = os.environ.get('CLIENT_ASSERTION_TYPE')

ESIGNET_SERVICE_URL = os.environ.get('ESIGNET_SERVICE_URL')
INTROSPECT_CLIENT_ID = (
    os.environ.get('INTROSPECT_CLIENT_ID')
    or os.environ.get('FARMER_CLIENT_ID')
    or '8HUq1QEXH7rtMzQdzocDY8LKKv6Y9EnF8BJWgGes7j0'
)
ESIGNET_TLS_INSECURE = (os.environ.get('ESIGNET_TLS_INSECURE', 'true').lower() == 'true')
ESIGNET_HTTP_TIMEOUT_SECS = int(os.environ.get('ESIGNET_HTTP_TIMEOUT_SECS', '20'))


def _oidc_rp_configured():
    return bool(
        CLIENT_ID
        and REDIRECT_URI
        and AUTHORIZATION_ENDPOINT
        and TOKEN_ENDPOINT
        and USERINFO_ENDPOINT
        and PRIVATE_KEY
        and CLIENT_ASSERTION_TYPE
    )


def _build_authorize_url():
    if not _oidc_rp_configured():
        return ''
    global CODE_VERIFIER, CODE_CHALLENGE
    generate_pkce()
    claims = {
        'userinfo': {
            'name': {'essential': True},
            'phone_number': {'essential': True},
            'email': {'essential': True},
            'picture': {'essential': True},
            'gender': {'essential': True},
            'birthdate': {'essential': True},
            'address': {'essential': True},
            'nationality': {'essential': True},
            'individual_id': {'essential': True},
        },
        'id_token': {},
    }
    encoded_claims = urllib.parse.quote(json.dumps(claims))
    return (
        f'{AUTHORIZATION_ENDPOINT}?'
        f'claims_locales=en&'
        f'response_type=code&'
        f'client_id={CLIENT_ID}&'
        f'redirect_uri={REDIRECT_URI}&'
        f'scope=openid profile email&'
        f'acr_values=mosip:idp:acr:generated-code:biometrics&'
        f'code_challenge=Qa34J02L95JjcCWyyBFDvRgFWAgtwzQQavBWBBEs0_8&'
        f'code_challenge_method=S256&'
        f'claims={encoded_claims}'
    )

CODE_VERIFIER = None
CODE_CHALLENGE = None

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s',
)

# Helper to generate PKCE
def generate_pkce():
    global CODE_VERIFIER, CODE_CHALLENGE
    CODE_VERIFIER = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b'=').decode('utf-8')
    CODE_CHALLENGE = base64.urlsafe_b64encode(
        hashlib.sha256(CODE_VERIFIER.encode('utf-8')).digest()
    ).rstrip(b'=').decode('utf-8')

def base64url_decode(input_str):
    logging.info("Decoding base64...")
    padding = '=' * (4 - (len(input_str) % 4))
    return base64.urlsafe_b64decode(input_str + padding)

def load_private_key_from_string(base64_key_str):
    logging.info("Loading private key from base64 key string")
    try:
        # Decode the base64 string
        key_bytes = base64.b64decode(base64_key_str)
        jwk_ = json.loads(key_bytes)

        # Decode the base64url components
        n = int.from_bytes(base64url_decode(jwk_['n']), 'big')
        e = int.from_bytes(base64url_decode(jwk_['e']), 'big')
        d = int.from_bytes(base64url_decode(jwk_['d']), 'big')

        p = int.from_bytes(base64url_decode(jwk_['p']), 'big') if 'p' in jwk_ else None
        q = int.from_bytes(base64url_decode(jwk_['q']), 'big') if 'q' in jwk_ else None
        dmp1 = int.from_bytes(base64url_decode(jwk_['dp']), 'big') if 'dp' in jwk_ else None
        dmq1 = int.from_bytes(base64url_decode(jwk_['dq']), 'big') if 'dq' in jwk_ else None
        iqmp = int.from_bytes(base64url_decode(jwk_['qi']), 'big') if 'qi' in jwk_ else None

        public_numbers = rsa.RSAPublicNumbers(e, n)

        if p and q and dmp1 and dmq1 and iqmp:
            private_numbers = rsa.RSAPrivateNumbers(
                p=p,
                q=q,
                d=d,
                dmp1=dmp1,
                dmq1=dmq1,
                iqmp=iqmp,
                public_numbers=public_numbers
            )
        else:
            private_numbers = rsa.RSAPrivateNumbers(
                p=None,
                q=None,
                d=d,
                dmp1=None,
                dmq1=None,
                iqmp=None,
                public_numbers=public_numbers
            )

        private_key = private_numbers.private_key(default_backend())
        logging.info("Private Key Loaded Successfully")
        return private_key

    except Exception as e:
        logging.error(f"Failed to load private key: {e}")
        raise

def generate_signed_jwt(client_id):
    logging.info("Generating signed JWT ...")
    header = {
        "alg": ALGORITHM,
        "typ": "JWT",
    }

    payload = {
        "iss": client_id,
        "sub": client_id,
        "aud": TOKEN_ENDPOINT,
        "exp": datetime.utcnow() + EXPIRATION_TIME,
        "iat": datetime.utcnow(),
    }

    private_key = load_private_key_from_string(PRIVATE_KEY)

    signed_jwt = jwt.encode(payload, private_key, algorithm=ALGORITHM, headers=header)
    logging.info("Signed JWT generated.")
    return signed_jwt


def _derive_esignet_service_url():
    if ESIGNET_SERVICE_URL:
        return ESIGNET_SERVICE_URL.rstrip("/")
    if TOKEN_ENDPOINT and "/oauth/" in TOKEN_ENDPOINT:
        return TOKEN_ENDPOINT.split("/oauth/")[0].rstrip("/")
    return None


def _introspect_bearer(request):
    auth = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
    if not auth or not auth.startswith("Bearer "):
        return (False, 401, {"error": "invalid_request", "error_description": "Authorization: Bearer <token> required"})
    token = auth[7:].strip()
    base_url = _derive_esignet_service_url()
    if not base_url:
        return (False, 500, {"error": "server_error", "error_description": "Missing ESIGNET_SERVICE_URL (or TOKEN_ENDPOINT invalid)"})
    if not INTROSPECT_CLIENT_ID:
        return (False, 500, {"error": "server_error", "error_description": "Missing INTROSPECT_CLIENT_ID"})

    introspect_urls = [
        f"{base_url}/oauth/introspect",
        f"{base_url}/oauth/v2/introspect",
    ]
    payload = {
        "token": token,
        "token_type_hint": "access_token",
        "client_id": INTROSPECT_CLIENT_ID,
    }
    try:
        last = None
        for introspect_url in introspect_urls:
            r = requests.post(
                introspect_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=ESIGNET_HTTP_TIMEOUT_SECS,
                verify=(not ESIGNET_TLS_INSECURE),
            )
            last = (introspect_url, r)
            if r.status_code == 200:
                data = _safe_json(r)
                if not data.get("active"):
                    return (False, 401, {"error": "invalid_token", "introspection": data})
                return (True, 200, data)

        # All attempts failed. Treat as upstream error (not an "invalid token") because the server couldn't validate.
        tried_url, tried_resp = last if last else (None, None)
        return (False, 502, {
            "error": "introspection_failed",
            "error_description": f"Introspection HTTP error (status={getattr(tried_resp, 'status_code', None)})",
            "introspection_url": tried_url,
            "introspection_urls_tried": introspect_urls,
            "introspection_http_status": getattr(tried_resp, 'status_code', None),
            "introspection": _safe_json(tried_resp) if tried_resp else None,
        })
    except Exception as e:
        logging.error(f"Introspection failed: {e}")
        return (False, 502, {
            "error": "introspection_failed",
            "error_description": str(e),
            "introspection_urls_tried": introspect_urls,
        })


def _safe_json(resp):
    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text}


def health(request):
    return JsonResponse({'status': 'ok', 'service': 'farmer-registry-demo'})


def api_resource(request):
    ok, status, data = _introspect_bearer(request)
    if not ok:
        return JsonResponse(data, status=status)
    sub = data.get("sub") or data.get("psu_token")
    return JsonResponse({
        'resource_server': 'farmer-registry-demo',
        "token_subject": sub,
        "audience": data.get("aud"),
        "source_audience": data.get("source_audience"),
        "target_audience": data.get("target_audience"),
        "scope": data.get("scope"),
        "resource": {
            "recordId": "RS-DEMO-001",
            "ownerDisplayName": "Abebe Bikila",
            "attributes": {
                "tier": "basic",
                "status": "active",
                "lastUpdated": "2025-11-15",
            },
            "notes": "Sample protected record — replace with real lookup keyed by the introspected subject.",
        }
    })


def api_farmer(request):
    ok, status, data = _introspect_bearer(request)
    if not ok:
        return JsonResponse(data, status=status)
    sub = data.get("sub") or data.get("psu_token")
    return JsonResponse({
        "farmerId": f"FARM-{str(sub)[-6:]}",
        "psuToken": sub,
        "sector": data.get("target_audience"),
        "scope": data.get("scope"),
        "profile": {
            "fullName": "Abebe Bikila",
            "region": "Addis Ababa",
            "status": "ACTIVE",
        },
        "introspection": data,
    })


def farmer_ui(request):
    ctx = {
        "farmer": None,
        "error": None,
    }
    if request.method == "POST":
        token = (request.POST.get("token") or "").strip()
        if not token:
            ctx["error"] = "Token is required"
            return render(request, "oidc_app/farmer.html", ctx)

        # Fake a request-like object by calling introspection directly.
        base_url = _derive_esignet_service_url()
        if not base_url or not INTROSPECT_CLIENT_ID:
            ctx["error"] = "Missing ESIGNET_SERVICE_URL/INTROSPECT_CLIENT_ID configuration"
            return render(request, "oidc_app/farmer.html", ctx)

        try:
            introspect_url = f"{base_url}/oauth/introspect"
            payload = {
                "token": token,
                "token_type_hint": "access_token",
                "client_id": INTROSPECT_CLIENT_ID,
            }
            r = requests.post(
                introspect_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=ESIGNET_HTTP_TIMEOUT_SECS,
                verify=(not ESIGNET_TLS_INSECURE),
            )
            data = _safe_json(r)
            if r.status_code != 200 or not data.get("active"):
                ctx["error"] = {"error": "invalid_token", "introspection": data}
                return render(request, "oidc_app/farmer.html", ctx)

            sub = data.get("sub") or data.get("psu_token")
            ctx["farmer"] = {
                "farmerId": f"FARM-{str(sub)[-6:]}",
                "psuToken": sub,
                "sector": data.get("target_audience"),
                "scope": data.get("scope"),
                "profile": {
                    "fullName": "Abebe Bikila",
                    "region": "Addis Ababa",
                    "status": "ACTIVE",
                },
                "introspection": data,
            }
        except Exception as e:
            ctx["error"] = str(e)

    return render(request, "oidc_app/farmer.html", ctx)

def home(request):
    auth_url = _build_authorize_url()
    return render(request, 'oidc_app/home.html', {'auth_url': auth_url})


def login_user(request):
    """Handle username/password login with Fayda verification requirement"""
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        
        # Simple validation (in real app, you'd validate against database)
        if username and email and password:
            # Store basic user info in session (not verified)
            request.session['user_name'] = username
            request.session['user_email'] = email
            request.session['user_phone'] = '+251 91 123 4567'
            request.session['user_gender'] = 'Not Specified'
            request.session['user_birthdate'] = 'Not Specified'
            request.session['user_nationality'] = 'Not Specified'
            request.session['user_address'] = 'Not Specified'
            request.session['user_picture'] = ''
            request.session['user_sub'] = f'demo_{username}'
            request.session['fayda_verified'] = False
            
            return redirect('unverified_dashboard')
        else:
            return render(request, 'oidc_app/home.html', {
                'error': 'Please fill in all fields',
                'auth_url': _build_authorize_url(),
            })
    
    return redirect('home')


def unverified_dashboard(request):
    """Dashboard for users who haven't verified with Fayda"""
    context = {
        'user_name': request.session.get('user_name', 'User'),
        'auth_url': _build_authorize_url(),
    }
    return render(request, 'oidc_app/unverified_dashboard.html', context)


def dashboard(request):
    """Main banking dashboard"""
    # In a real application, you would get user data from session or database
    # For demo purposes, we'll use sample data
    context = {
        'name': request.session.get('user_name', 'John Doe'),
        'email': request.session.get('user_email', 'john.doe@example.com'),
        'user_picture': request.session.get('user_picture', ''),
    }
    return render(request, 'oidc_app/dashboard.html', context)


def profile(request):
    """User profile management page"""
    # In a real application, you would get user data from session or database
    context = {
        'name': request.session.get('user_name', 'John Doe'),
        'email': request.session.get('user_email', 'john.doe@example.com'),
        'phone': request.session.get('user_phone', '+251 91 123 4567'),
        'gender': request.session.get('user_gender', 'Male'),
        'birthdate': request.session.get('user_birthdate', '1990-01-01'),
        'residence_status': request.session.get('user_nationality', 'Ethiopian'),
        'address': request.session.get('user_address', 'Addis Ababa, Ethiopia'),
        'user_picture': request.session.get('user_picture', ''),
    }
    return render(request, 'oidc_app/profile.html', context)


def account_verification(request):
    """Account verification status page"""
    return render(request, 'oidc_app/account_verification.html')


def loan_eligibility(request):
    """Loan eligibility checker page"""
    return render(request, 'oidc_app/loan_eligibility.html')


def account_balance(request):
    """Account balance page"""
    return render(request, 'oidc_app/account_balance.html')


def transactions(request):
    """Recent transactions page"""
    return render(request, 'oidc_app/transactions.html')


def exchange_rates(request):
    """Exchange rates page"""
    return render(request, 'oidc_app/exchange_rates.html')


def logout(request):
    """Logout user and clear session"""
    request.session.flush()
    return redirect('home')


def coming_soon(request):
    """Coming soon page for features under development"""
    return render(request, 'oidc_app/coming_soon.html')


@csrf_exempt
def callback(request):
    if request.method == "GET":
        if not _oidc_rp_configured():
            return JsonResponse(
                {
                    'error': 'oidc_not_configured',
                    'error_description': 'Set CLIENT_ID, REDIRECT_URI, AUTHORIZATION_ENDPOINT, TOKEN_ENDPOINT, USERINFO_ENDPOINT, PRIVATE_KEY, and CLIENT_ASSERTION_TYPE to enable this callback.',
                },
                status=503,
            )
        code = request.GET.get('code')
        if not code:
            return JsonResponse({"error": "Authorization code not provided"}, status=400)

        signed_jwt = generate_signed_jwt(CLIENT_ID)
        token_url = TOKEN_ENDPOINT

        payload = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT_URI,
            'client_id': CLIENT_ID,
            'client_assertion_type': CLIENT_ASSERTION_TYPE,
            'client_assertion': signed_jwt,
            'code_verifier': "mr1FJpYpOyV.YBXg3dAWee18berTlOxgqDlaReTyJjmOMsYGdiTgohtBkvck0I.JQyVDe4U_16o2zm2JQKaScIvMTj3zn59i2e0~lGGOHeS0tK1RAuTq40Z01jPW2BKc",
        }

        logging.info(f"Payload: {payload}")

        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        try:
            response = requests.post(token_url, data=payload, headers=headers)

            if response.status_code == 200:
                token_data = response.json()
                access_token = token_data.get('access_token')
                logging.info(f"access token {access_token}")
                userinfo_url = USERINFO_ENDPOINT
                userinfo_headers = {'Authorization': f'Bearer {access_token}'}
                userinfo_response = requests.get(userinfo_url, headers=userinfo_headers)

                if userinfo_response.status_code == 200:
                    user_info_response = userinfo_response.text
                    try:
                        # Decode the JWT without verification (use verify=True if needed)
                        decoded_user_info = jwt.decode(user_info_response, options={"verify_signature": False}, algorithms="RS256")
                        name = decoded_user_info.get('name', 'N/A')
                        email = decoded_user_info.get('email', 'N/A')
                        sub = decoded_user_info.get('sub', 'N/A')
                        picture = decoded_user_info.get('picture', '')
                        phone = decoded_user_info.get('phone_number', '')
                        birthdate = decoded_user_info.get('birthdate', '')
                        residence_status = decoded_user_info.get('nationality', '')
                        gender = decoded_user_info.get('gender', ''),
                        address = decoded_user_info.get('address', '')
                        logging.info("------------------------------")
                        # logging.info(user_info_response)
                        logging.info("###############################")
                        logging.info(decoded_user_info)
                        logging.info("###############################")

                        # Store user data in session for dashboard access
                        request.session['user_name'] = name
                        request.session['user_email'] = email
                        request.session['user_phone'] = phone
                        request.session['user_gender'] = gender
                        request.session['user_birthdate'] = birthdate
                        request.session['user_nationality'] = residence_status
                        request.session['user_address'] = address
                        request.session['user_picture'] = picture
                        request.session['user_sub'] = sub
                        request.session['fayda_verified'] = True

                        # Pass the user info to the template for rendering
                        context = {
                            'name': name,
                            'email': email,
                            'sub': sub,
                            'picture': picture,
                            'phone': phone,
                            'residence_status': residence_status,
                            'birthdate': birthdate,
                            'gender': gender,
                            'address': address,
                        }
                        # logging.info("Not decoded user info:" + user_info_response)
                        logging.info("User info decode successful!")
                        return render(request, 'oidc_app/callback.html', context)

                    except Exception as e:
                        return JsonResponse({"error": f"Failed to decode JWT: {str(e)}"}, status=500)
                else:
                    logging.error(f"Userinfo request failed with status: {userinfo_response.status_code}")
                    return JsonResponse({"error": "Failed to retrieve user information"}, status=500)
            else:
                logging.info(f"Error occurred with status code: {response.status_code} and response is: {response.content}")
                return JsonResponse({"error": f"Token exchange failed: {response.status_code}"}, status=500)

        except Exception as e:
            logging.error(f"Exception occurred -- {e}")
            return JsonResponse({"error": f"Callback processing failed: {str(e)}"}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
def userinfo(request):
    if request.method == 'POST':
        if not _oidc_rp_configured():
            return JsonResponse(
                {
                    'error': 'oidc_not_configured',
                    'error_description': 'USERINFO proxy requires full OIDC RP variables in .env.',
                },
                status=503,
            )
        try:
            body = json.loads(request.body)
            access_token = body.get('access_token')
            logging.info(f"access_token {access_token}")

            userinfo_url = USERINFO_ENDPOINT
            userinfo_headers = {'Authorization': f'Bearer {access_token}'}
            userinfo_response = requests.get(userinfo_url, headers=userinfo_headers)

            logging.info("Userinfo")
            logging.info(userinfo_response.text)

            decoded_user_info = jwt.decode(
                userinfo_response.text,
                options={"verify_signature": False},
                algorithms=["RS256"]
            )

            logging.info(decoded_user_info)
            return JsonResponse(decoded_user_info)
        except Exception as e:
            logging.error(f"Error in /userinfo/: {e}", exc_info=True)
            return JsonResponse({"error": "Internal Server Error"}, status=500)
    else:
        return JsonResponse({"error": "Method not allowed"}, status=405)