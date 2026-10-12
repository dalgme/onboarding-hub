// 모의 GoTrue — 앱이 쓰는 엔드포인트만: 비밀번호 로그인·토큰 갱신·내 정보·로그아웃·비밀번호 변경·
// 매직링크 검증, 관리자 API(사용자 생성/목록/수정/삭제·generate_link).
// 토큰은 서명 검증 없는 JWT 모양(exp 포함) — supabase-js 가 만료 판정에 exp/expires_at 을 보기 때문
import { randomUUID, createHash } from "node:crypto";

const b64url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

export class AuthError extends Error {
  constructor(status, errorCode, msg) {
    super(msg);
    this.status = status;
    this.errorCode = errorCode;
  }
  toJSON() {
    return { code: this.status, error_code: this.errorCode, msg: this.message };
  }
}

export function createAuth() {
  return { users: new Map(), sessions: new Map(), refreshTokens: new Map(), links: new Map() };
}

function publicUser(user) {
  const { password, ...rest } = user;
  void password;
  return rest;
}

export function findUserByEmail(auth, email) {
  const wanted = email.toLowerCase();
  return [...auth.users.values()].find((user) => user.email === wanted) ?? null;
}

export function createUser(auth, { email, password = null, user_metadata = {}, email_confirm = true }) {
  if (!email) throw new AuthError(422, "validation_failed", "Unable to validate email address: invalid format");
  if (findUserByEmail(auth, email)) throw new AuthError(422, "email_exists", "A user with this email address has already been registered");
  const at = new Date().toISOString();
  const user = {
    id: randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email: email.toLowerCase(),
    email_confirmed_at: email_confirm ? at : null,
    confirmed_at: email_confirm ? at : null,
    phone: "",
    last_sign_in_at: null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { ...user_metadata },
    identities: [],
    is_anonymous: false,
    created_at: at,
    updated_at: at,
    password,
  };
  auth.users.set(user.id, user);
  return publicUser(user);
}

export function updateUser(auth, id, attributes) {
  const user = auth.users.get(id);
  if (!user) throw new AuthError(404, "user_not_found", "User not found");
  if (attributes.password !== undefined) user.password = attributes.password;
  if (attributes.email) user.email = attributes.email.toLowerCase();
  const meta = attributes.user_metadata ?? attributes.data;
  if (meta) user.user_metadata = { ...user.user_metadata, ...meta };
  user.updated_at = new Date().toISOString();
  return publicUser(user);
}

export function deleteUser(auth, id) {
  if (!auth.users.has(id)) throw new AuthError(404, "user_not_found", "User not found");
  auth.users.delete(id);
  for (const [token, session] of auth.sessions) if (session.userId === id) auth.sessions.delete(token);
}

export function listUsers(auth) {
  return [...auth.users.values()].map(publicUser);
}

function jwt(user, exp) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    iss: "http://127.0.0.1:54321/auth/v1",
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    exp,
    iat: Math.floor(Date.now() / 1000),
    session_id: randomUUID(),
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
  });
  const signature = createHash("sha256").update(`${header}.${payload}.qa`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function createSession(auth, user) {
  const expiresIn = 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const accessToken = jwt(user, exp);
  const refreshToken = randomUUID().replace(/-/g, "");
  auth.sessions.set(accessToken, { userId: user.id, exp });
  auth.refreshTokens.set(refreshToken, user.id);
  user.last_sign_in_at = new Date().toISOString();
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: exp,
    refresh_token: refreshToken,
    user: publicUser(user),
  };
}

export function signInWithPassword(auth, email, password) {
  const user = email ? findUserByEmail(auth, email) : null;
  if (!user || user.password == null || user.password !== password) {
    throw new AuthError(400, "invalid_credentials", "Invalid login credentials");
  }
  return createSession(auth, user);
}

export function refresh(auth, refreshToken) {
  const userId = auth.refreshTokens.get(refreshToken);
  const user = userId ? auth.users.get(userId) : null;
  if (!user) throw new AuthError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
  auth.refreshTokens.delete(refreshToken);
  return createSession(auth, user);
}

export function userFromToken(auth, token) {
  const session = token ? auth.sessions.get(token) : null;
  if (!session) return null;
  if (session.exp * 1000 < Date.now()) return null;
  const user = auth.users.get(session.userId);
  return user ? publicUser(user) : null;
}

export function logout(auth, token) {
  auth.sessions.delete(token);
}

// 매직링크: hashed_token 하나로 1회 검증된다
export function generateLink(auth, email) {
  const user = findUserByEmail(auth, email);
  if (!user) throw new AuthError(404, "user_not_found", "User not found");
  const hashedToken = createHash("sha256").update(randomUUID()).digest("hex");
  auth.links.set(hashedToken, { userId: user.id, createdAt: Date.now() });
  return {
    action_link: `http://127.0.0.1:54321/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=`,
    email_otp: "000000",
    hashed_token: hashedToken,
    verification_type: "magiclink",
    redirect_to: "",
    ...publicUser(user),
  };
}

export function verifyOtp(auth, tokenHash, type) {
  const pending = tokenHash ? auth.links.get(tokenHash) : null;
  if (!pending || type !== "magiclink") {
    throw new AuthError(403, "otp_expired", "Email link is invalid or has expired");
  }
  auth.links.delete(tokenHash);
  const user = auth.users.get(pending.userId);
  if (!user) throw new AuthError(404, "user_not_found", "User not found");
  return createSession(auth, user);
}
