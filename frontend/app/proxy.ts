import { NextRequest, NextResponse } from "next/server";
import { isValidSessionToken } from "./app/lib/session";

const GUEST_ONLY_ROUTES = ["/", "/log_in", "/create_account"];
const PUBLIC_ROUTES = ["/terms", "/privacy"];

function hasValidSession(request: NextRequest): Promise<boolean> {
	return isValidSessionToken(request.cookies.get("access_token")?.value);
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const authenticated = await hasValidSession(request);
	const isGuestOnlyRoute = GUEST_ONLY_ROUTES.includes(pathname);
	const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

	if (!authenticated && !isGuestOnlyRoute && !isPublicRoute) {
		return NextResponse.redirect(new URL("/log_in", request.url));
	}

	if (authenticated && isGuestOnlyRoute) {
		return NextResponse.redirect(new URL("/gamerooms", request.url));
	}

	return NextResponse.next();
}

export const config = {
	// exclui internals do Next e qualquer ficheiro estatico servido a partir de public/ (tem extensao no ultimo segmento)
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
