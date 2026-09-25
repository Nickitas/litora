import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { UserDto } from "@litora/contracts";
import { AuthService } from "./auth.service.js";
export interface AuthRequest {
  headers: { authorization?: string };
  user: UserDto;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.authenticate(request.headers.authorization);
    return true;
  }
}
