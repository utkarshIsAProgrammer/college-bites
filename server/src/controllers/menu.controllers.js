import Menu from "../models/menu.model.js";

// Get entire menu
export const getMenu = async (req, res) => {
    try {
        const menu = await Menu.find({ isAvailable: true });
        res.status(200).json({
            success: true,
            menu,
        });
    } catch (err) {
        console.log(`Get menu error: ${err}`);

        res.status(500).json({
            success: false,
            message: "Failed to fetch menu!",
        });
    }
};

// Get menu item
export const getMenuItem = async (req, res) => {
    try {
        const { id } = req.params;

        const item = await Menu.findById({ id, isAvailable: true });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        res.status(200).json({
            success: true,
            item,
        });
    } catch (err) {
        console.error("Get menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch menu item!",
        });
    }
};

// Create menu item
export const createMenuItem = async (req, res) => {
    try {
        const { name, description, price, category, image } = req.body;
        if (!name || price === undefined || !category) {
            return res.status(400).json({
                success: false,
                message: "Name, price and category are required!",
            });
        }

        const item = await Menu.create({
            name,
            description,
            price,
            category,
            image,
        });

        res.status(201).json({
            success: true,
            message: "Menu item created successfully!",
            item,
        });
    } catch (err) {
        console.error("Create menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to create menu item!",
        });
    }
};

// Update menu item
export const updateMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Menu.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        res.status(200).json({
            success: true,
            message: "Menu item updated successfully!",
            item,
        });
    } catch (err) {
        console.error("Update menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to update menu item!",
        });
    }
};

// Delete menu
export const deleteMenuItem = async (req, res) => {
    try {
        const { id } = req.params;

        const item = await Menu.findByIdAndDelete(id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        res.status(200).json({
            success: true,
            message: "Menu item deleted successfully!",
        });
    } catch (err) {
        console.error("Delete menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to delete menu item!",
        });
    }
};
