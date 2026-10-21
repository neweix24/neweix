-- ১. প্রোডাক্ট টেবিল
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image_url TEXT,
    category TEXT,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ২. অর্ডার টেবিল (ডেলিভারি ট্র্যাকিং ও পেমেন্ট স্ট্যাটাস সহ)
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    items TEXT NOT NULL, -- JSON String
    total_amount REAL NOT NULL,
    delivery_charge REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'COD',
    payment_status TEXT DEFAULT 'Pending',
    order_status TEXT DEFAULT 'Pending',
    courier_tracking_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ৩. ওটিপি ভেরিফিকেশন টেবিল
CREATE TABLE IF NOT EXISTS otp_codes (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);