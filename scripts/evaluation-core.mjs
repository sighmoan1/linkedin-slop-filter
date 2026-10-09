export function summary(rows) {
 const useful=rows.filter(r=>r.label==='useful');
 const slop=rows.filter(r=>r.label==='slop');
 const hidden=rows.filter(r=>r.hidden);
 const usefulWronglyHidden=useful.filter(r=>r.hidden).length;
 return {
  total:rows.length,valid:rows.filter(r=>!r.error).length,errors:rows.filter(r=>r.error).length,
  useful:useful.length,usefulWronglyHidden,
  usefulHiddenRate:useful.length?usefulWronglyHidden/useful.length:null,
  hidden:hidden.length,hiddenPrecision:hidden.length?(hidden.length-usefulWronglyHidden)/hidden.length:null,
  slop:slop.length,slopLeftVisible:slop.filter(r=>!r.hidden).length
 };
}
