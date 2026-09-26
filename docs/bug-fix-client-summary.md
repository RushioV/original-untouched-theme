# Product page fix – options not updating product details

**For:** Store owner / client\
**Status:** Fixed and ready to publish

## What was wrong

On product pages with several options (for example different sizes or colours), some of the product details did not change when a shopper picked a different option. The product code and the stock message ("In stock", "Only a few left", "Out of stock") could stay hidden or blank after switching, even though that information exists for the option the shopper chose.

## What shoppers experienced

A shopper choosing, say, a different size could not see the product code or whether that size was in stock. This made it hard to be sure they were buying exactly the right item, and some may have left without buying.

This happened whenever the option shown first on the page did not have a product code, or was not set up to track stock. The other options then never showed theirs.

## What we changed

We corrected the way the product page shows and hides these details. Now, every time a shopper picks an option, the product code and stock message refresh to match the option they selected, exactly as they would if the page had just been opened on that option.

Nothing else about the product page has changed. The price, images and "Add to cart" button behave as before.

## What you need to do

Nothing. The fix takes effect as soon as this version of the theme is published. We have checked that switching between options, including options that are sold out or unavailable, works correctly.
