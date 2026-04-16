# Antigravity Node.js Backend Setup Guide

This guide covers everything you need to know to run the new fully-custom Node.js + Express backend for the Antigravity (Luxa Wach) e-commerce application.

## 1. Prerequisites
- **Node.js**: Ensure Node.js (v18+) is installed on your machine.
- **MongoDB**: Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
- **Cloudinary**: Create a free account on [Cloudinary](https://cloudinary.com/) for handling product image uploads.

## 2. Installation
Navigate into the `server` directory and install the required dependencies:

```bash
cd server
npm install
```

## 3. Environment Variables
In the `server` root directory, there is a `.env` file. You must fill in the following values before starting the server:

```env
PORT=5000
NODE_ENV=development

# Get this connection string from your MongoDB Atlas dashboard (Connect > Drivers)
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/antigravity?retryWrites=true&w=majority

# Recommended: Generate a strong random string (e.g. using a password generator)
JWT_SECRET=supersecretantigravitykey

# Get these from your Cloudinary Dashboard
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 4. Running the Server
To start the server in development mode (which automatically restarts on file changes):

```bash
npm run dev
```

You should see logs indicating:
```
Server running on port 5000
MongoDB Connected: cluster0.mongodb.net
```

## 5. API Endpoints (Postman Testing)

The base URL for all local testing is `http://localhost:5000`.

### Authentication
- `POST /api/auth/register` - Create an admin user.
  - **Body (JSON):** `{"name": "Admin", "email": "admin@luxawach.com", "password": "password123"}`
- `POST /api/auth/login` - Login to get your JWT token.
  - **Body (JSON):** `{"email": "admin@luxawach.com", "password": "password123"}`
  - **Response:** Returns your user details alongside a `"token"`. You must include this token in the `Authorization` header as `Bearer <token>` for all protected routes below.

### Products
- `GET /api/products` - Fetch all products (Public)
- `GET /api/products/:id` - Fetch a single product (Public)
- `POST /api/products` - Create a product (Protected, Admin Only)
  - **Type:** `multipart/form-data`
  - **Fields:** `name`, `price`, `description`, `brand`, `category`, `stock`.
  - **Files:** `images` (Up to 4 images, automatically uploaded to Cloudinary).
- `PUT /api/products/:id` - Update a product (Protected, Admin Only)
- `DELETE /api/products/:id` - Delete a product (Protected, Admin Only)

### Orders
- `POST /api/orders` - Create an order (Public)
  - **Body (JSON):** Requires `orderItems` (array), `shippingAddress` (object), and `totalPrice`.
- `GET /api/orders` - Fetch all orders (Protected, Admin Only)
- `PUT /api/orders/:id/status` - Update order tracking status (Protected, Admin Only)

### Inquiries (Contact Form)
- `POST /api/inquiries` - Submit a contact message (Public)
- `GET /api/inquiries` - Read all messages (Protected, Admin Only)
- `PUT /api/inquiries/:id/status` - Mark message as read/replied (Protected, Admin Only)

## 6. Frontend Connection Guide
The frontend React application requires `axios` to make HTTP requests to this backend. 
In your React code, all Firebase `addDoc` and `getDocs` calls have been replaced with:

```javascript
import axios from 'axios';

// Example: Fetching products in Shop.tsx
const { data } = await axios.get('http://localhost:5000/api/products');
setProducts(data);
```

For protected routes (like Admin Dashboard), the JWT token from `localStorage` is attached automatically:
```javascript
const config = {
  headers: { Authorization: `Bearer ${user.token}` }
};
const { data } = await axios.post('http://localhost:5000/api/products', formData, config);
```

## 7. Production Deployment
When you are ready to launch your backend live to the internet:
1. Push this `server` codebase to GitHub.
2. Link your GitHub repository to **Render.com** (Web Service).
3. Set the Build Command to `npm install` and Start Command to `node server.js`.
4. Add all your `.env` variables to Render's Environment Variables dashboard.
5. Once live, take the Render URL (e.g., `https://antigravity-api.onrender.com`) and replace `http://localhost:5000` in your React frontend API calls!
