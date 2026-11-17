export const intervals=Object.freeze([0.5,1,2,3,5,10,15,30]);
export const defaultIntervalMinutes=1;
export const intervalLabel=value=>value===0.5?'30 seconds':value+' minute'+(value===1?'':'s');
