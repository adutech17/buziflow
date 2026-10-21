import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { AuthError } from "./lib/auth-policy";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const { validateOrigin } = await import('./server/custom-auth');
      validateOrigin(request);
    }
    return await next();
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    if (new URL(request.url).pathname.startsWith('/api/')) {
      console.error('ShopFlow request failed');
      return Response.json({ error: 'Service temporarily unavailable.', code: 'SERVICE_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
