const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });

const authRoutes = require('./modules/auth/auth.routes');
const systemRoutes = require('./modules/system/system.routes');
const organizationRoutes = require('./modules/organizations/organization.routes');
const userRoutes = require('./modules/users/users.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const subcategoryRoutes = require('./modules/subcategories/subcategory.routes');
const productRoutes = require('./modules/products/product.routes');
const publicProductRoutes = require('./modules/products/product.public.routes');
const publicLogoRoutes = require('./modules/logos/logo.public.routes');
const logoRoutes = require('./modules/logos/logo.routes');
const designRoutes = require('./modules/products/design.routes');
const orderRoutes = require('./modules/orders/order.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const groupRoutes = require('./modules/groups/groups.routes');
const customizationRoutes = require('./modules/custom/customProduct.routes');
const couponRoutes = require('./modules/coupons/coupons.routes');
const stripeWebhookRoute = require('./webhook/stripe.webhook.route');
const statsRoutes = require('./modules/stats/stats.routes');
const userCustom = require('./modules/usercustom/userCustom.routes');
const userOrders = require('./modules/userorder/orders.routes');
const orderCheckout = require('./modules/checkout/checkout.routes');

const app = express();
app.set('trust proxy', 1);

// ─── CORS must be first ───────────────────────────────────────────────────────
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://final-frontend-36rb.vercel.app",
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-system-key"],
};

app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions)); // handle preflight for all routes

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Stripe webhook (raw body needed, BEFORE express.json()) ─────────────────
app.use('/api/webhooks/stripe', stripeWebhookRoute);

// ─── JSON body parser (after webhook) ────────────────────────────────────────
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/system', systemRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/public', publicProductRoutes);
app.use('/api/public', publicLogoRoutes);
app.use('/api/logos', logoRoutes);
app.use('/api/designs', designRoutes);
app.use('/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/customizations', customizationRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/user/custom', userCustom);
app.use('/api/user/orders', userOrders);
app.use('/api/user/checkout', orderCheckout);

module.exports = app;