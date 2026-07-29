import Sidebar from "../components/Sidebar";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={` h-full antialiased`}>
      <body className="">
        <div className="h-screen w-screen flex p-2">
          <Sidebar />
          <div className="w-full">{children}</div>
        </div>
      </body>
    </html>
  );
}
