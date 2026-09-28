-- 011_product_images.sql — Add product images and display image support
-- images stores a JSON array of up to 4 image URLs or data URLs
-- display_image stores the primary/active display image URL or data URL

ALTER TABLE products ADD COLUMN images TEXT;
ALTER TABLE products ADD COLUMN display_image TEXT;
