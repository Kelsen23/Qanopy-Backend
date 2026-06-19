const rotateArray = <T>(items: T[], offset: number): T[] => {
  if (!items.length) return [];

  const normalizedOffset = offset % items.length;

  return [
    ...items.slice(normalizedOffset),
    ...items.slice(0, normalizedOffset),
  ];
};

export default rotateArray;
