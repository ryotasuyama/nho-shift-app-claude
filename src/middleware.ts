import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

function parseRole(value: unknown): "admin" | "staff" {
  return value === "admin" ? "admin" : "staff";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public paths - allow access, redirect authenticated users away from login
  if (isPublicPath(pathname)) {
    if (user && pathname === "/login") {
      const role = parseRole(user.user_metadata?.role);
      const redirectTo = role === "admin" ? "/dashboard" : "/home";
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return response;
  }

  // API routes - return 401 JSON for unauthenticated, pass user info via headers
  if (pathname.startsWith("/api/")) {
    if (!user) {
      console.log("[middleware] BLOCKED", pathname, "- no user session");
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "認証が必要です" } },
        { status: 401 }
      );
    }
    const role = parseRole(user.user_metadata?.role);
    response.headers.set("x-user-id", user.id);
    response.headers.set("x-user-role", role);
    response.headers.set("x-user-email", user.email ?? "");
    return response;
  }

  // Protected pages - redirect to login if unauthenticated
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = parseRole(user.user_metadata?.role);
  // Role-based routing
  if (pathname === "/") {
    const redirectTo = role === "admin" ? "/dashboard" : "/home";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  // Admin-only pages
  const adminPaths = ["/dashboard", "/admin"];
  if (adminPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/home", request.url));
    }
  }

  // Staff-only pages
  const staffPaths = ["/home", "/requests"];
  if (staffPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // /shifts/:termId - staff only for viewing
  if (pathname.startsWith("/shifts/") && !pathname.startsWith("/shifts/admin")) {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
