const LoginInput = ({type,placeholder,onChange,...props}) => (
  <input
    type={type}
    placeholder={placeholder}
    aria-label={placeholder}
    onChange={onChange}
    className="border-b border-b-gray-400 w-full h-10 placeholder:text-[10px] focus:outline-none"
    {...props}
  />
);

export default LoginInput;
