# Compact customer and staff interfaces

Refine the existing interface from the user's feedback: amenities need stronger emphasis, room cards leave excessive unused space, profile surfaces blend together, important actions and explanations are weak, and staff roles need the same standards.

- Home: retain landscape photography above a compact information grid. Place room type and plain price together, description across the content area, amenities and a compact action at the lower right. Reduce image height and title sizes. Preserve orange room names and the unboxed price. Use Lucide amenity icons and orange underlines; expand amenity space on mobile.
- Profile: introduce a clearer page/sidebar/detail/payment surface hierarchy; shorten oversized titles and spacing, add concise guidance to filters and transaction states, and expose the payment form through the main contextual action.
- Staff: apply one shared compact shell, section/table/form vocabulary and action hierarchy to all five roles; keep permissions and transaction rules unchanged. Explain role tasks and pending/approval distinctions in plain Thai.
- Shared quality: two fonts, semantic status colors, visible focus, 44px minimum touch targets and at least 10px gaps between peer actions. Use existing APIs and native disclosure/form controls, with no framework or runtime dependency.

Independent account and staff agents own only their respective frontend files. Main agent owns homepage changes, assets, integration and browser verification. Validate room/photo/content layout, profile/payment/chat recovery, staff role loading/actions/disclosures and overflow at 375, 768, 1024 and 1440px. Inspect desktop/mobile screenshots in one batch and confirm fixes once. Run relevant controller checks and the existing API suite after integration.
