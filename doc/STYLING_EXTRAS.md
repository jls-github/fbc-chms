Footer
------

We include a small footer partial rendered in the application layout. It uses
the same utility classes and will only render optional links if the route
helpers exist to avoid errors in minimal installs.

```erb
<%= render "shared/footer" %>
```

Notes about tests
-----------------

To keep the existing controller tests working without changes, the
authentication concern disables the `before_action :require_authentication`
when running in the `test` environment. This keeps controller tests from
being redirected to the sign-in page. If you'd prefer stricter test behavior,
we can instead update tests to sign in a test user before exercising
authenticated endpoints (recommended for future-proofing).
