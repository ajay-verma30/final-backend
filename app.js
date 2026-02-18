const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

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

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));


app.use('/auth', authRoutes);
app.use('/system', systemRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/public', publicProductRoutes);
app.use('/api/public', publicLogoRoutes);
app.use('/api/logos', logoRoutes);
app.use('/api/designs', designRoutes);
app.use('/orders', orderRoutes);
app.use('/cart', cartRoutes);

module.exports = app;