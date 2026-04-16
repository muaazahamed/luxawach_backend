NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/<db>?retryWrites=true&w=majority
# Optional override for environments where Node resolves DNS via localhost (comma-separated)
MONGO_DNS_SERVERS=8.8.8.8,1.1.1.1
JWT_SECRET=replace_with_a_long_random_secret
OTP_SECRET=replace_with_a_long_random_otp_secret_min_32_chars
ORDER_TRACKING_SECRET=replace_with_a_long_random_tracking_secret_min_32_chars

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
FRONTEND_URL=http://localhost:3000

# Comma-separated list. Example: http://localhost:3000,https://your-site.netlify.app
CORS_ORIGIN=http://localhost:3000

RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=30
LOGIN_RATE_LIMIT_MAX=30
OTP_RATE_LIMIT_MAX=3
KEEP_ALIVE_TIMEOUT_MS=65000
HEADERS_TIMEOUT_MS=70000

ADMIN_EMAIL=luxawachpk@gmail.com
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=45
ADMIN_PASSWORD=replace_with_admin_password
