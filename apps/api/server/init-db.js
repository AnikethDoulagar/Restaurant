const { init, db } = require('./db');
const bcrypt = require('bcryptjs');

init();

const existing = db.prepare('SELECT COUNT(*) as count FROM restaurants').get();
if (existing.count === 0) {
  const restaurantId = 'demo-001';
  db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)').run(restaurantId, 'Demo Restaurant');

  const hash = bcrypt.hashSync('password123', 10);
  db.prepare('INSERT INTO owners (username, password, restaurant_id, role) VALUES (?, ?, ?, ?)').run('admin', hash, restaurantId, 'owner');

  const adminHash = bcrypt.hashSync('Aniketh@13', 10);
  db.prepare('INSERT INTO owners (username, password, restaurant_id, role) VALUES (?, ?, ?, ?)').run('superadmin', adminHash, restaurantId, 'super_admin');

  const items = [
    // Appetizers
    ['Spring Rolls', 'Crispy veg spring rolls with sweet chili dip', 6.99, 'Appetizers', 1],
    ['Chicken Wings', 'Spicy grilled chicken wings', 8.99, 'Appetizers', 0],
    ['Paneer Tikka', 'Grilled cottage cheese with spices', 7.99, 'Appetizers', 1],
    ['Samosa (3 pcs)', 'Crispy fried pastry filled with spiced potatoes', 5.99, 'Appetizers', 1],
    ['Fish Fingers', 'Crispy battered fish strips with tartar sauce', 9.99, 'Appetizers', 0],
    ['Onion Rings', 'Beer-battered onion rings with dip', 5.99, 'Appetizers', 1],
    ['Bruschetta', 'Toasted bread with tomato, basil and olive oil', 6.99, 'Appetizers', 1],
    ['Nachos Supreme', 'Tortilla chips with cheese, salsa and sour cream', 8.99, 'Appetizers', 1],

    // Soups and Salads
    ['Tomato Soup', 'Classic creamy tomato soup with croutons', 4.99, 'Soups and Salads', 1],
    ['Hot & Sour Soup', 'Spicy and tangy traditional soup', 5.49, 'Soups and Salads', 1],
    ['Caesar Salad', 'Romaine lettuce, croutons, parmesan with Caesar dressing', 7.99, 'Soups and Salads', 1],
    ['Greek Salad', 'Feta cheese, olives, cucumber, tomato with oregano dressing', 8.49, 'Soups and Salads', 1],

    // Turkish Grills & Indian Platters
    ['Seekh Kebab', 'Minced lamb skewers with mint chutney', 11.99, 'Turkish Grills & Indian Platters', 0],
    ['Tandoori Chicken (Half)', 'Chicken marinated in yogurt and spices, clay-oven grilled', 12.99, 'Turkish Grills & Indian Platters', 0],
    ['Grilled Fish Platter', 'Herb-crusted fish fillet with grilled vegetables', 15.99, 'Turkish Grills & Indian Platters', 0],
    ['Shawarma Plate', 'Spiced chicken shawarma with garlic sauce and fries', 10.99, 'Turkish Grills & Indian Platters', 0],

    // Dim Sums and Sushi
    ['Veg Dim Sum Basket', 'Steamed vegetable dumplings with soy dip', 8.99, 'Dim Sums and Sushi', 1],
    ['Chicken Dim Sum Basket', 'Steamed chicken dumplings with chili oil', 9.99, 'Dim Sums and Sushi', 0],
    ['California Roll (8 pcs)', 'Crab, avocado and cucumber sushi roll', 13.99, 'Dim Sums and Sushi', 0],
    ['Dragon Roll (8 pcs)', 'Shrimp tempura and eel avocado roll', 15.99, 'Dim Sums and Sushi', 0],

    // Pizzas and Pastas
    ['Margherita Pizza', 'Classic tomato, mozzarella and basil pizza', 10.99, 'Pizzas and Pastas', 1],
    ['Pepperoni Pizza', 'Loaded with pepperoni and mozzarella cheese', 12.99, 'Pizzas and Pastas', 0],
    ['Pasta Alfredo', 'Creamy white sauce pasta with garlic bread', 11.99, 'Pizzas and Pastas', 1],
    ['Arrabbiata Pasta', 'Spicy tomato sauce pasta with herbs', 10.99, 'Pizzas and Pastas', 1],
    ['Lasagna', 'Layered pasta with béchamel, ragù and cheese', 13.99, 'Pizzas and Pastas', 0],

    // Asian Cuisine
    ['Veg Fried Rice', 'Wok-tossed rice with mixed vegetables and soy', 9.99, 'Asian Cuisine', 1],
    ['Chicken Noodles', 'Stir-fried noodles with chicken and vegetables', 10.99, 'Asian Cuisine', 0],
    ['Kung Pao Chicken', 'Spicy Sichuan chicken with peanuts and chili', 13.99, 'Asian Cuisine', 0],
    ['Pad Thai', 'Thai stir-fried rice noodles with tamarind sauce', 12.99, 'Asian Cuisine', 1],
    ['Thai Green Curry', 'Coconut-based green curry with jasmine rice', 14.99, 'Asian Cuisine', 1],

    // Continental Cuisine
    ['Grilled Chicken Steak', 'Chicken breast with mushroom sauce and mash', 16.99, 'Continental Cuisine', 0],
    ['Fish & Chips', 'Beer-battered cod with fries and mushy peas', 14.99, 'Continental Cuisine', 0],
    ['Roasted Chicken', 'Half-roasted chicken with herbs and seasonal veggies', 17.99, 'Continental Cuisine', 0],
    ['Shepherd\'s Pie', 'Minced lamb with mashed potato crust', 13.99, 'Continental Cuisine', 0],

    // Indian Cuisine
    ['Butter Chicken', 'Creamy tomato-based curry with butter and cream', 14.99, 'Indian Cuisine', 0],
    ['Dal Makhani', 'Slow-cooked black lentils in rich creamy gravy', 10.99, 'Indian Cuisine', 1],
    ['Paneer Butter Masala', 'Cottage cheese in rich tomato cream sauce', 12.99, 'Indian Cuisine', 1],
    ['Chicken Biryani', 'Fragrant basmati rice layered with spiced chicken', 13.99, 'Indian Cuisine', 0],
    ['Veg Biryani', 'Basmati rice with mixed vegetables and saffron', 11.99, 'Indian Cuisine', 1],
    ['Rogan Josh', 'Kashmiri lamb curry with aromatic spices', 15.99, 'Indian Cuisine', 0],
    ['Chole Bhature', 'Spiced chickpea curry with fried bread', 9.99, 'Indian Cuisine', 1],
    ['Garlic Naan', 'Tandoor-baked bread with garlic butter', 3.49, 'Indian Cuisine', 1],
    ['Tandoori Roti', 'Whole wheat tandoor bread', 2.49, 'Indian Cuisine', 1],
    ['Steamed Rice', 'Plain steamed basmati rice', 3.99, 'Indian Cuisine', 1],

    // Desserts
    ['Gulab Jamun (2 pcs)', 'Milk dumplings in rose syrup', 5.99, 'Desserts', 1],
    ['Kheer', 'Rice pudding with nuts and cardamom', 5.49, 'Desserts', 1],
    ['Chocolate Brownie', 'Warm chocolate brownie with ice cream', 7.99, 'Desserts', 1],
    ['Cheesecake', 'New York style baked cheesecake with berry compote', 8.99, 'Desserts', 1],
    ['Ice Cream Sundae', 'Three scoops with chocolate sauce and nuts', 6.99, 'Desserts', 1],

    // Liquor
    ['Whiskey (Single Malt)', 'Premium single malt whiskey - 60ml', 12.99, 'Liquor', 0],
    ['Premium Vodka', 'Imported vodka - 60ml', 9.99, 'Liquor', 0],
    ['Dark Rum', 'Aged dark rum - 60ml', 8.99, 'Liquor', 0],
    ['Gin', 'Premium London dry gin - 60ml', 9.99, 'Liquor', 0],

    // Cocktails
    ['Classic Mojito', 'Mint, lime, soda and white rum', 10.99, 'Cocktails', 0],
    ['Margarita', 'Tequila, lime and triple sec', 11.99, 'Cocktails', 0],
    ['Old Fashioned', 'Bourbon, sugar, bitters and orange peel', 12.99, 'Cocktails', 0],
    ['Long Island Iced Tea', 'Vodka, tequila, rum, gin with cola', 13.99, 'Cocktails', 0],
    ['Pina Colada', 'Rum, coconut cream and pineapple juice', 10.99, 'Cocktails', 0],

    // Non-Alcoholic Drinks
    ['Mango Lassi', 'Yogurt drink with mango pulp', 4.99, 'Non-Alcoholic Drinks', 1],
    ['Masala Chai', 'Spiced Indian tea', 3.49, 'Non-Alcoholic Drinks', 1],
    ['Fresh Lime Soda', 'Fresh lime juice with soda water', 3.99, 'Non-Alcoholic Drinks', 1],
    ['Cold Coffee', 'Chilled coffee with milk and ice cream', 5.49, 'Non-Alcoholic Drinks', 1],
    ['Berry Smoothie', 'Mixed berry and yogurt smoothie', 6.49, 'Non-Alcoholic Drinks', 1],
  ];
  const insert = db.prepare(
    'INSERT INTO menu_items (restaurant_id, name, description, price, category, is_veg) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const [name, desc, price, cat, isVeg] of items) {
    insert.run(restaurantId, name, desc, price, cat, isVeg);
  }

  console.log('Database seeded with demo restaurant');
  console.log('  Owner login:  admin / password123');
  console.log('  Admin login:  admin / Aniketh@13');
  console.log('  Restaurant ID: demo-001');
}

console.log('Database initialized');
