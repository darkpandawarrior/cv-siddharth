// LANE P10C (wave 10): a small, hand-maintained calendar of the major
// annual meteor showers -- own data, not scraped (the IMO working list
// itself serves HTML, no JSON feed, per the 2026-09-30 globe recheck). Every
// value below is cited to the IMO's own published working list:
// https://imo.net/files/meteor-shower/cal2026.pdf (Table 5, page 25).
// Reverified from the indexed primary publication 2026-09-30; live site
// currently serves a restoration page instead of the PDF. This is a static
// 2026 calendar baseline, not a live forecast or observed meteor rate.
// Parent bodies: https://science.nasa.gov/solar-system/meteors-meteorites/facts/
// and https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/.
// Scientific numeric facts transcribed; no prose, charts or images copied.
// RA/Dec are the radiant's J2000 mean position at peak; ZHR is the IMO's
// published typical zenithal hourly rate (a single representative figure,
// not a year-by-year forecast). Windows use month/day only (no year), so
// the same table works every year -- meteors.ts's monthDayInRange handles
// a window crossing the Dec/Jan boundary (Quadrantids) the same way as any
// other.
export interface MeteorShower {
  name: string;
  parentBody: string;
  zhr: number;
  raHours: number;
  decDeg: number;
  peakMonth: number; // 1-12
  peakDay: number;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

export const MAJOR_SHOWERS: readonly MeteorShower[] = [
  { name: "Quadrantids", parentBody: "2003 EH1", zhr: 80, raHours: 230 / 15, decDeg: 49, peakMonth: 1, peakDay: 3, startMonth: 12, startDay: 28, endMonth: 1, endDay: 12 },
  { name: "Lyrids", parentBody: "C/1861 G1 (Thatcher)", zhr: 18, raHours: 271 / 15, decDeg: 34, peakMonth: 4, peakDay: 22, startMonth: 4, startDay: 14, endMonth: 4, endDay: 30 },
  { name: "Eta Aquariids", parentBody: "1P/Halley", zhr: 50, raHours: 338 / 15, decDeg: -1, peakMonth: 5, peakDay: 6, startMonth: 4, startDay: 19, endMonth: 5, endDay: 28 },
  { name: "Southern Delta Aquariids", parentBody: "96P/Machholz (suspected)", zhr: 25, raHours: 340 / 15, decDeg: -16, peakMonth: 7, peakDay: 31, startMonth: 7, startDay: 12, endMonth: 8, endDay: 23 },
  { name: "Perseids", parentBody: "109P/Swift-Tuttle", zhr: 100, raHours: 48 / 15, decDeg: 58, peakMonth: 8, peakDay: 13, startMonth: 7, startDay: 17, endMonth: 8, endDay: 24 },
  { name: "Orionids", parentBody: "1P/Halley", zhr: 20, raHours: 95 / 15, decDeg: 16, peakMonth: 10, peakDay: 21, startMonth: 10, startDay: 2, endMonth: 11, endDay: 7 },
  { name: "Southern Taurids", parentBody: "2P/Encke", zhr: 7, raHours: 52 / 15, decDeg: 15, peakMonth: 11, peakDay: 5, startMonth: 9, startDay: 20, endMonth: 11, endDay: 20 },
  { name: "Leonids", parentBody: "55P/Tempel-Tuttle", zhr: 15, raHours: 152 / 15, decDeg: 22, peakMonth: 11, peakDay: 17, startMonth: 11, startDay: 6, endMonth: 11, endDay: 30 },
  { name: "Geminids", parentBody: "3200 Phaethon", zhr: 150, raHours: 112 / 15, decDeg: 33, peakMonth: 12, peakDay: 14, startMonth: 12, startDay: 4, endMonth: 12, endDay: 20 },
  { name: "Ursids", parentBody: "8P/Tuttle", zhr: 10, raHours: 217 / 15, decDeg: 76, peakMonth: 12, peakDay: 22, startMonth: 12, startDay: 17, endMonth: 12, endDay: 26 },
] as const;

export const METEOR_CALENDAR_SOURCE = "https://imo.net/files/meteor-shower/cal2026.pdf";
