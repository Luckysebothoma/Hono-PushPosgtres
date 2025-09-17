FROM oven/bun:alpine

WORKDIR /app
 COPY . .

RUN bun install
#RUN bun run build

EXPOSE 3000

# Run the script on container startup
#ENTRYPOINT ["sh","/usr/local/bin/run_groq_hono_api.sh"]
 
CMD ["bun","run","index.ts"]
