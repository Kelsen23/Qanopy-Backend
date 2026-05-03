const getStableOffset = (value: string, length: number): number => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return length ? hash % length : 0;
};

export default getStableOffset;
