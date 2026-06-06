const url = 'https://www.dailymotion.com/video/x5pw0zi';
const isDailyMotion = url?.includes('dailymotion.com');
const dmVideoId = isDailyMotion ? url?.split('/video/')[1]?.split('?')[0] : null;
console.log({isDailyMotion, dmVideoId});
