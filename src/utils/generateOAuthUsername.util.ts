import prisma from "../config/prisma.config.js";

function generateOAuthUsername(base: string, maxLength = 20) {
  let username = base.slice(0, maxLength);

  const randomPrefix = () => Math.floor(Math.random() * 90 + 10).toString();

  let exists = async (name: string) =>
    !!(await prisma.user.findUnique({ where: { username: name } }));

  const attempt = async (): Promise<string> => {
    if (!(await exists(username))) return username;

    let temp = username;
    while (await exists(temp)) {
      temp = temp.slice(0, temp.length - 1);
      temp = randomPrefix() + temp;
      temp = temp.slice(0, maxLength);
    }
    return temp;
  };

  return attempt();
}

export default generateOAuthUsername;
