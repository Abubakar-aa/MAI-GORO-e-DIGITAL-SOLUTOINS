# MAI GORO — Customer Portal and Verification

Verification services and request submission now live in the portal at `portal-services.html`. The dashboard entry point is `portal.html`; it links to independent account and service pages.

## Verification flow

- The portal reads active services and prices from `verify_services`.
- Selecting a service opens its request form on `portal-services.html?service=<service-code>`.
- The form only asks for fields needed by that service and validates Nigerian NIN, BVN, and phone formats where applicable.
- Requests are saved as pending for team review. Submission does not charge the wallet or return an instant provider result.
- Customers can follow request status in `portal-history.html`.
- The service list is intentionally allowlisted to the portal's offered NIN, BVN, IPE, CAC, and JAMB profile services; exam PIN products are listed in the PIN shop.
- Every service renders through the same card component (`.svc-card` in `portal-layout.css`): category icon, name, description, live price and the action that opens the request form. Zero-price services show "Price on request" instead of a number.

`verify.html` has been retired. Navigation and customer-facing entry points lead to the portal services page.
