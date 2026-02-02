## 2025-05-22 - [Secure Markdown Component]
**Vulnerability:** Potential XSS and reverse tabnabbing through unsanitized AI-generated Markdown content.
**Learning:** Even when using "safe" libraries like `react-markdown`, centralizing rendering and explicitly enforcing secure defaults (like `rel="noopener noreferrer"`) is crucial for defense in depth. Additionally, ensure that supporting plugins (like `@tailwindcss/typography`) are correctly enabled in the build configuration.
**Prevention:** Always use a centralized wrapper for rendering external or AI-generated content and verify that security-related attributes are applied to dynamically generated links.
