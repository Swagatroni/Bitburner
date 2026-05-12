// an array of 1 -100
let length = 3;
let min = 10 ** (length - 1);
let max = 10 ** length - 1;
let arr = Array.from({ length: max - min + 1 }, (_, i) => i + min);


for (let i = 2; i < length; i++) {
  const isDivisible = true;

  console.log(`Divisible By ${i}:\t${isDivisible}\t`);
}
