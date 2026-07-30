"use client";
import Image from "next/image";
import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01FreeIcons,
  CheckIcon,
  DashboardSquare01FreeIcons,
  FolderLibraryFreeIcons,
  UnfoldMoreIcon,
  UserPlus,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const Sidebar = () => {
  const [
    isWorkspaceAccountModalOpen,
    setIsWorkspaceAccountModalOpen,
  ] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  return (
    <div className="w-82 flex flex-col justify-between p-3 rounded-2xl bg-[#F3F1F0] border border-base/10 shadow shadow-dark/5 h-full">
      <div className="flex flex-col">
        <Image
          src="/logo.svg"
          alt="Xenon"
          width={160}
          height={50}
          className="mb-5 h-auto w-20"
          priority
        />
        <div className="w-full relative">
          <div
            onClick={() =>
              setIsWorkspaceAccountModalOpen(!isWorkspaceAccountModalOpen)
            }
            className="flex cursor-pointer w-full bg-base/7 shadow border border-base/5 shadow-dark/3 p-2 py-1 rounded-xl items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Image
                src="/workspaceprofile.png"
                alt="Xenon"
                width={1000}
                height={1000}
                className="size-8.5 rounded-lg ring-2 ring-base/25 object-cover"
                priority
              />
              <div className="flex flex-col -space-y-0.25">
                <h1 className="font-bold text-dark/90 text-[14px]">
                  Ariyo&apos;s Workspace
                </h1>
                <p className="font-bold text-dark/55 text-[12px]">3 members</p>
              </div>
            </div>
            <button
            // className="bg-[#F3F1F0] border border-base/10 rounded-lg shadow shadow-dark/5 p-0.75"
            >
              <HugeiconsIcon
                icon={UnfoldMoreIcon}
                className="size-5 text-base cursor-pointer"
              />
            </button>
          </div>
          <AnimatePresence>
            {isWorkspaceAccountModalOpen && (
              <motion.div
                key="account-modal"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-[105%] shadow-lg gap-1 flex flex-col p-1 shadow-dark/5 bg-[#EBE7E3]/70 border border-base/10 backdrop-blur-lg rounded-[14px] w-full z-50"
              >
                <div className="w-full flex items-center justify-between bg-base/10 rounded-[10px] p-1.5">
                  <div className="flex items-center gap-2">
                    <Image
                      src="/workspaceprofile.png"
                      alt="Profile Picture"
                      width={1000}
                      height={1000}
                      className="rounded-[8px] size-7.5 object-cover"
                    />
                    <h1 className="font-medium text-base text-[15px]">
                      Ariyo&apos;s Workspace
                    </h1>
                  </div>
                  <HugeiconsIcon
                    className="size-5 text-base"
                    icon={CheckIcon}
                  />
                </div>
                <div className="w-full flex items-center bg-base text-white transition-all duration-300 justify-between cursor-pointer rounded-[10px] p-2 border border-white/3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon className="size-5 " icon={UserPlus} />
                    <h1 className=" font-medium text-[15px]">New Workspace</h1>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-1.5 mt-6 w-full">
          <Link
            href="/"
            className="flex items-center w-full rounded-xl font-semibold gap-2 p-2 text-[15px] bg-base text-white"
          >
            <HugeiconsIcon
              icon={DashboardSquare01FreeIcons}
              className="size-4.75"
              strokeWidth={1.8}
            />
            Overview
          </Link>
          <Link
            href="/"
            className="flex items-center w-full rounded-xl font-semibold gap-2 p-2 text-[15px] text-base opacity-50"
          >
            <HugeiconsIcon
              icon={FolderLibraryFreeIcons}
              className="size-4.75"
              strokeWidth={1.8}
            />
            Collections
          </Link>
          <Link
            href="/"
            className="flex items-center w-full rounded-xl font-semibold gap-2 p-2 text-[15px] text-base opacity-50"
          >
            <HugeiconsIcon
              icon={DashboardSquare01FreeIcons}
              className="size-4.75"
              strokeWidth={1.8}
            />
            Overview
          </Link>
          <Link
            href="/"
            className="flex items-center w-full rounded-xl font-semibold gap-2 p-2 text-[15px] text-base opacity-50"
          >
            <HugeiconsIcon
              icon={DashboardSquare01FreeIcons}
              className="size-4.75"
              strokeWidth={1.8}
            />
            Overview
          </Link>
        </div>
      </div>
      <div className="flex w-full flex-col">
        <div className="relative w-full">
          <div
            onClick={() => setIsAccountModalOpen(!isAccountModalOpen)}
            className="flex cursor-pointer items-center justify-between w-full"
          >
            <div className="flex gap-2">
              <Image
                src="/workspaceprofile.png"
                alt="Xenon"
                width={1000}
                height={1000}
                className="size-8.5 rounded-full ring-2 ring-base/25 object-cover"
                priority
              />
              <div className="flex flex-col -space-y-0.5">
                <h1 className="text-[15px] font-bold text-dark/90">Ariyo</h1>
                <p className="text-[12px] font-semibold text-dark/50">
                  therealteejay25@gmail.com
                </p>
              </div>
            </div>
            <HugeiconsIcon
              icon={ArrowRight01FreeIcons}
              className="size-4.5 text-dark/75"
              strokeWidth={1.8}
            />
          </div>
          <AnimatePresence>
            {isAccountModalOpen && (
              <motion.div
                key="account-modal"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-[110%] shadow-lg gap-2 flex flex-col p-2 shadow-dark/5 bg-[#EBE7E3]/70 border border-base/10 backdrop-blur-lg rounded-[14px] w-full z-50"
              >
                <div className="flex border-b border-dark/10 pb-2 w-full justify-between items-center">
                  <div className="flex gap-2">
                    <Image
                      src="/workspaceprofile.png"
                      alt="Xenon"
                      width={1000}
                      height={1000}
                      className="size-8.5 rounded-full ring-2 ring-base/25 object-cover"
                      priority
                    />
                    <div className="flex flex-col -space-y-0.5">
                      <h1 className="text-[15px] font-bold text-dark/90">
                        Ariyo
                      </h1>
                      <p className="text-[12px] font-semibold text-dark/50">
                        therealteejay25@gmail.com
                      </p>
                    </div>
                  </div>
                  {/* <div className="px-1 py-0.5 rounded-[5px] bg-linear-to-r from-base to-[#D39C5D] text-white font-bold text-[10px]">PRO</div> */}
                </div>
                <div className="flex w-full bg-linear-to-r p-2 text-white rounded-[11px] from-base to-[#D39C5D]">
                  u
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
