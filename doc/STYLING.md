Styling for fbc-chms

This app uses Tailwind CSS via the CDN. Tailwind is loaded from `https://cdn.tailwindcss.com`
in the application layout, and custom base styles and reusable components (buttons, cards,
form inputs) are defined in `app/assets/stylesheets/application.css`.

The Tailwind CDN is configured with custom theme extensions (primary colors and Inter font)
via JavaScript in the layout file. No build process is required — changes to CSS take effect
immediately on page refresh.

Notes:
- Prefer Tailwind utility classes in views. The small `.btn-primary`, `.btn-secondary`, `.card`, and
  `.form-input` components are convenience helpers defined in `application.css`.
- To modify Tailwind theme configuration, update the `tailwind.config` JavaScript object in
  `app/views/layouts/application.html.erb`.
- Custom component styles in `application.css` use regular CSS (not `@apply` directives) for
  compatibility with the CDN.

Examples
--------

Header (already added as a partial)

```erb
<%= render "shared/header" %>
```

This renders a fixed top header with navigation links and action buttons:
- Primary action: `<button class="btn-primary">` — indigo filled button
- Secondary action: `<button class="btn-secondary">` — bordered white button

Card usage (groups, members, lists)

Wrap a list item or panel with the `.card` utility and use `.card-title` for the heading:

```erb
<div class="card">
  <div class="card-title">Group Name</div>

  <div class="flow-y">
    <div>
      <strong class="block">Meeting time</strong>
      <div class="text-sm text-gray-700">Sundays 10:00 AM</div>
    </div>

    <div>
      <strong class="block">Meeting location</strong>
      <div class="text-sm text-gray-700">Main Hall</div>
    </div>
  </div>
</div>
```

Form controls

Use `.form-label` and `.form-input` for consistent label/input styling:

```erb
<label class="form-label">Name</label>
<input class="form-input" type="text" name="group[name]" />
```

That’s it — these small helpers keep views readable while preserving Tailwind's
utility-first approach.
