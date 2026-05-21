import { Module } from '@nestjs/common';
import { TestigosModule } from './testigos/testigos.module';
import { AbogadosModule } from './abogados/abogados.module';
import { MovilidadModule } from './movilidad/movilidad.module';
import { RefrigeriosModule } from './refrigerios/refrigerios.module';
import { ComparendosModule } from './comparendos/comparendos.module';

// Aggregates the 5 resource modules (Pregoneros removed per Amendment 10).
// Each is fleshed out in Phase 4 (T24).
@Module({
  imports: [
    TestigosModule,
    AbogadosModule,
    MovilidadModule,
    RefrigeriosModule,
    ComparendosModule,
  ],
})
export class ResourcesModule {}
