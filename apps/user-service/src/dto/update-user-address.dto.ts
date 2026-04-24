// cyna-api/apps/user-service/src/dto/update-user-address.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateUserAddressDto } from './create-user-address.dto';

export class UpdateUserAddressDto extends PartialType(CreateUserAddressDto) {}
