/** All dimensions in feet. X runs along the building length, Z along the width, Y up. */
export interface BuildingSpec {
  name: string;
  length: number;
  width: number;
  eaveHeight: number;
  ridgeHeight: number;
}
