
const LoginInput = ({type,placeholder,onChange})=>{
    return(
        <input
          type={type}
          placeholder={placeholder}
          onChange={onChange}
          className="border-b border-b-gray-400 w-full h-10 placeholder:text-[10px] focus:outline-none"
        />
    )
}

export default LoginInput;
