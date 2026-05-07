const deepGreen = async (ns, hostname, details) => {
  const heartbleed = await ns.dnet.heartbleed(hostname);
  try {
    let arr = [];
    while (true) {
      for (let i = 0; i < 10; i++) {
        let password = i.toString().repeat(details.passwordLength);
        const result = await ns.dnet.authenticate(hostname, password);
        if (!result.success) {
          const data = JSON.parse(heartbleed.logs).data.split(",");
          if (data[0] || data[1]) arr.push(i);
        } else return true;
      }
    }
  } catch (e) {}
};

let data = [0, 0];
if (data[0] || data[1]) console.log("true");
