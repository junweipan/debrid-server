const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

const toChineseIsoString = (inputDate = new Date()) => {
  const baseDate = inputDate instanceof Date ? inputDate : new Date(inputDate);
  return new Date(baseDate.getTime() + CHINA_TIME_OFFSET_MS).toISOString();
};

module.exports = {
  CHINA_TIME_OFFSET_MS,
  toChineseIsoString,
};
