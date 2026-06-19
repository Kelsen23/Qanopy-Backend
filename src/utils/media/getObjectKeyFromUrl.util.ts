const getObjectKeyFromUrl = (url: string) => {
  try {
    const fixedUrl =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;

    const pathname = new URL(fixedUrl).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch (error) {
    console.error("Invalid URL in getObjectKeyFromUrl:", url, error);
    return null;
  }
};

export default getObjectKeyFromUrl;
