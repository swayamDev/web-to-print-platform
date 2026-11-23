# /admin

Administrator console: production queue, job detail and file downloads, products and
templates, customers, reports. Every page and server action calls `requireAdmin()` on the
server; middleware redirects are a convenience, not the security boundary.
