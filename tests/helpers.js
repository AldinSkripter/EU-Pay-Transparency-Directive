// Registration leaves the account unverified. Tests that are not about verification mark every user verified.
export const verifyAll = store => { for (const user of store.users.values()) user.email_verified_at ??= new Date(); };
