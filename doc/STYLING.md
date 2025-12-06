Styling for fbc-chms

This app uses Tailwind CSS via the `tailwindcss-rails` gem. Tailwind's entry is
located at `app/assets/tailwind/application.css`. Custom base styles and a few
small reusable components (buttons, cards, form inputs) live in that file.

To run Tailwind in development (watch for changes):

```bash
bin/rails tailwindcss:watch
```

If you're using the local Procfile for development the project already contains
an entry to run the Tailwind watcher (see `Procfile.dev`).

Notes:
- Prefer Tailwind utility classes in views. The small `.btn-primary`, `.btn-secondary`, `.card`, and
  `.form-input` components are convenience helpers placed in the Tailwind
  entry file.
- If you change Tailwind configuration or add plugins, run the build/watch
  commands so the compiled CSS in `app/assets/builds/tailwind.css` is updated.

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
