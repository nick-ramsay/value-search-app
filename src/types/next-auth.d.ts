import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    firstname?: string;
    lastname?: string;
  }

  interface Session {
    user: User & {
      id?: string;
      firstname?: string;
      lastname?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    firstname?: string;
    lastname?: string;
  }
}
