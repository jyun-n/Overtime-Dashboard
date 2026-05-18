// 사용법:
//   npm run hash -- <비밀번호>
// 또는 인자 없이 실행하면 표준입력으로 받음.
//
// 출력된 해시를 User 테이블의 passwordHash 컬럼에 그대로 INSERT.

import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';

const ROUNDS = 12;

async function main(): Promise<void> {
  let password = process.argv[2];

  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Password: ');
    rl.close();
  }

  if (!password) {
    console.error('No password provided.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, ROUNDS);
  console.log(hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
