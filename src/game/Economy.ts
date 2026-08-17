import { MYSTERY_BOX_BASE_COST, MYSTERY_BOX_COST_STEP } from './constants';

export class MysteryBox {
  pulls = 0;

  get cost(): number {
    return MYSTERY_BOX_BASE_COST + this.pulls * MYSTERY_BOX_COST_STEP;
  }

  pull() {
    this.pulls++;
  }
}
