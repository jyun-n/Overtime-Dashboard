export type Role = 'ADMIN' | 'USER';

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  department?: string;
  ip?: string;
};