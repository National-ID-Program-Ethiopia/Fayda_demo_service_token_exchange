from django.urls import path
from . import views
# from .views import fetch_userinfo

urlpatterns = [
    path('', views.home, name='home'),
    path('login/', views.login_user, name='login'),
    path('callback/', views.callback, name='callback'),
    path('userinfo/', views.userinfo, name='userinfo'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('unverified-dashboard/', views.unverified_dashboard, name='unverified_dashboard'),
    path('profile/', views.profile, name='profile'),
    path('account-verification/', views.account_verification, name='account_verification'),
    path('loan-eligibility/', views.loan_eligibility, name='loan_eligibility'),
    path('account-balance/', views.account_balance, name='account_balance'),
    path('transactions/', views.transactions, name='transactions'),
    path('exchange-rates/', views.exchange_rates, name='exchange_rates'),
    path('logout/', views.logout, name='logout'),
    path('coming-soon/', views.coming_soon, name='coming_soon'),

    # farmer-registry compatibility + UI
    path('health', views.health, name='health'),
    path('api/resource', views.api_resource, name='api_resource'),
    path('api/farmer', views.api_farmer, name='api_farmer'),
    path('farmer/', views.farmer_ui, name='farmer_ui'),
]
