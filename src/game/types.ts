export type Player = 'White' | 'Black';
export type Coord = { r:number; c:number };

export const SQUARE = 64;

export type Dir = 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
export const DIRS: Record<Dir,[number,number]> = {
  N:[-1,0], NE:[-1,1], E:[0,1], SE:[1,1],
  S:[1,0], SW:[1,-1], W:[0,-1], NW:[-1,-1],
};

export const inBounds = (r:number,c:number)=> r>=0&&r<8&&c>=0&&c<8;
export const coordEq = (a:Coord,b:Coord)=> a.r===b.r && a.c===b.c;
