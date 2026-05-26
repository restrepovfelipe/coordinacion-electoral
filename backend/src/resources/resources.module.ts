import { Module } from '@nestjs/common';
import { TestigosModule } from './testigos/testigos.module';
import { AbogadosModule } from './abogados/abogados.module';
import { MovilidadModule } from './movilidad/movilidad.module';
import { RefrigeriosModule } from './refrigerios/refrigerios.module';
import { ComparendosModule } from './comparendos/comparendos.module';
import { ReferenceModule } from './reference/reference.module.js';
import { JuradosModule } from './jurados/jurados.module.js';

@Module({
  imports: [
    TestigosModule,
    AbogadosModule,
    MovilidadModule,
    RefrigeriosModule,
    ComparendosModule,
    ReferenceModule,
    JuradosModule,
  ],
})
export class ResourcesModule {}
