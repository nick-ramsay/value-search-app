import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    firstname?: string;
    lastname?: string;
    role?: "admin" | "standard";
  }

  interface Session {
    user: User & {
      id?: string;
      firstname?: string;
      lastname?: string;
      role?: "admin" | "standard";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    firstname?: string;
    lastname?: string;
    role?: "admin" | "standard";
  }
}
