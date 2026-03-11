const normalizeText = (text: string) => {
  return text.trim().replace(/\s+/g, " ");
};

export default normalizeText;
