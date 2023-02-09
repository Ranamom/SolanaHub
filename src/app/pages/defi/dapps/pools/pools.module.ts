import { NgModule } from '@angular/core';
import { PoolsPageRoutingModule } from './pools-routing.module';

import { PoolsPage } from './pools.page';
import { SharedModule } from 'src/app/shared/shared.module';
import { WhirlPoolComponent } from './explore/whirl-pool/whirl-pool.component';
import { ExploreComponent } from './explore/explore.component';
import { PortfolioComponent } from './portfolio/portfolio.component';

@NgModule({
  imports: [
    SharedModule,
    PoolsPageRoutingModule,
  ],
  declarations: [
    PoolsPage,    
    ExploreComponent,
    PortfolioComponent,
    WhirlPoolComponent
  ]
})
export class PoolsPageModule {}