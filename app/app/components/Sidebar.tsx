import Image from 'next/image'
import React from 'react'

const Sidebar = () => {
  return (
      <div className='w-76 p-3 rounded-2xl bg-[#F3F1F0] border border-base/10 shadow shadow-dark/5 h-full'>
           <Image
          src="/logo.svg"
          alt="Xenon"
          width={160}
          height={50}
          className="mb-8 h-auto w-20"
          priority
        />
    </div>
  )
}

export default Sidebar