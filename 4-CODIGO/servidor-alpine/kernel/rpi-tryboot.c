/*
 * rpi-tryboot - reboot now, telling the Raspberry Pi firmware to use the
 * [tryboot] section of config.txt for this one boot only.
 *
 * The firmware driver (drivers/firmware/raspberrypi.c) only sets that flag
 * when the reboot syscall carries the argument "0 tryboot", which busybox's
 * reboot cannot pass. s6-linux-init runs this from rc.shutdown.final, after
 * every service is stopped and the disks are unmounted or read-only.
 *
 * No libc: three raw syscalls, so it builds the same with any aarch64 gcc
 * (cross on a laptop, or natively on Alpine) and is about 1 KB.
 *   gcc -Os -static -nostdlib -fno-pie -no-pie -fno-stack-protector -o rpi-tryboot rpi-tryboot.c
 */
#define SYS_sync    81
#define SYS_reboot  142
#define SYS_exit    93
#define LINUX_REBOOT_MAGIC1        0xfee1deadL
#define LINUX_REBOOT_MAGIC2        672274793L
#define LINUX_REBOOT_CMD_RESTART2  0xA1B2C3D4L

static long sys4(long n, long a, long b, long c, long d)
{
	register long x8 __asm__("x8") = n;
	register long x0 __asm__("x0") = a;
	register long x1 __asm__("x1") = b;
	register long x2 __asm__("x2") = c;
	register long x3 __asm__("x3") = d;

	__asm__ volatile("svc #0" : "+r"(x0) : "r"(x8), "r"(x1), "r"(x2), "r"(x3) : "memory");
	return x0;
}

void _start(void)
{
	static const char arg[] = "0 tryboot";

	sys4(SYS_sync, 0, 0, 0, 0);
	sys4(SYS_reboot, LINUX_REBOOT_MAGIC1, LINUX_REBOOT_MAGIC2,
	     LINUX_REBOOT_CMD_RESTART2, (long)arg);
	/* Only reached if the reboot was refused (not root) */
	sys4(SYS_exit, 1, 0, 0, 0);
	for (;;)
		;
}
